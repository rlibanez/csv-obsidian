const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const rendered = [];
  const state = new Map();
  const element = () => ({innerHTML:'',classList:{add(){}},addClass(){},appendChild(){}});
  class TextFileView {
    constructor(leaf) {this.leaf=leaf;this.contentEl=element();this.saves=0;}
    register() {}
    onPaneMenu(menu,source) {menu.nativeSource=source;}
    requestSave() {assert.ok(this instanceof TextFileView);this.saves++;}
  }
  class Plugin {
    registerView(type,create) {this.createView=create;this.type=type;}
    registerExtensions(extensions,type) {this.extensions=extensions;assert.equal(type,this.type);}
  }
  class Table {
    constructor(container,settings) {
      this.settings=settings;
      this.rootElement={id:''};
      this.data=[];
      // Auto-column sizing invokes the renderer during table construction,
      // before Obsidian associates the TextFileView with a file.
      for (const value of [undefined,null,42,'**CSV**'])
        settings.renderer(this,element(),0,0,0,value,{});
    }
    getPlugin(name) {
      if(name!=='persistentState')return {};
      return {
        saveValue:(key,value)=>state.set(`${this.rootElement.id}:${key}`,value),
        loadValue:(key,output)=>{output.value=state.get(`${this.rootElement.id}:${key}`)??false;},
      };
    }
    getSourceDataArray() {return this.data.map(row=>row.slice());}
    getColHeader() {return this.settings.colHeaders;}
    loadData(data) {this.data=data.map(row=>row.slice());}
    updateSettings(settings) {this.settings=settings;}
  }
  const obsidian={Plugin,TextFileView,addIcon(){},MarkdownRenderer:{
    renderMarkdown(value,cell,path,component) {rendered.push({value,path,component});}
  }};
  const source=fs.readFileSync(require.resolve('../src/main.ts'),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(compiled,{
    module,exports:module.exports,document:{createElement:element,body:element()},
    require(name) {
      if(name==='obsidian')return obsidian;
      if(name==='handsontable')return {default:Table};
      if(name==='papaparse')return require('papaparse');
      if(name.endsWith('.css')||name.endsWith('.scss'))return {};
      throw Error('Unexpected dependency '+name);
    }
  },{filename:'csv-view.js'});
  return {plugin:new module.exports.default(),rendered,element};
}

test('registers CSV and creates its view before a file is assigned',async()=>{
  const f=fixture();await f.plugin.onload();
  assert.equal(f.plugin.type,'csv');
  assert.equal(f.plugin.extensions[0],'csv');
  const view=f.plugin.createView({});
  assert.equal(view.getViewType(),'csv');
  assert.equal(view.hotSettings.editor,'text');
  assert.deepEqual(f.rendered.map(x=>x.value),['','','42','**CSV**']);
  assert.ok(f.rendered.every(x=>x.path==='' && x.component===view));
});

test('each CSV view renders Markdown relative to its own current file',()=>{
  const f=fixture(),a=f.plugin.csvViewCreator({}),b=f.plugin.csvViewCreator({});
  a.file={path:'A/first.csv'};b.file={path:'B/second.csv'};
  for(const view of [a,b,a])view.hotSettings.renderer(view.hot,f.element(),0,0,0,'[[Note]]',{});
  assert.deepEqual(f.rendered.slice(-3).map(x=>x.path),['A/first.csv','B/second.csv','A/first.csv']);
});

test('table mutation and sort hooks request saves on the CSV view',()=>{
  const f=fixture(),view=f.plugin.csvViewCreator({});
  const hooks=['afterColumnSort','afterColumnMove','afterRowMove','afterCreateCol','afterCreateRow','afterRemoveCol','afterRemoveRow'];
  for(const hook of hooks)view.hotSettings[hook].call(view.hot);
  assert.equal(view.saves,hooks.length);
  view.hotChange([], 'loadData');
  assert.equal(view.saves,hooks.length);
  view.hotChange([], 'edit');
  assert.equal(view.saves,hooks.length+1);
});


test('serialization preserves hidden source rows and CSV quoting after sorting/filtering',()=>{
  const f=fixture(),view=f.plugin.csvViewCreator({});
  const rows=[['Zoe','30'],['Beatriz, "B"','2'],['Luis','10']];
  view.hot.getSourceDataArray=()=>rows.map(row=>row.slice());
  view.hot.getData=()=>[['Luis','10']];
  view.hot.getColHeader=()=>['Nombre','Edad'];
  view.hotSettings.colHeaders=['Nombre','Edad'];
  const csv=view.getViewData();
  assert.deepEqual(require('papaparse').parse(csv).data,[['Nombre','Edad'],...rows]);
  assert.equal(view.getViewData(),csv,'repeated saves must not duplicate headers');
});


function paneMenu(view) {
  const items=[];
  const menu={addItem(callback){
    const item={
      setTitle(value){this.title=value;return this;},
      setIcon(value){this.icon=value;return this;},
      setChecked(value){this.checked=value;return this;},
      setDisabled(value){this.disabled=value;return this;},
      onClick(callback){this.click=callback;return this;},
    };
    callback(item);items.push(item);
  }};
  view.onPaneMenu(menu,'more-options');
  assert.equal(menu.nativeSource,'more-options','keep inherited native pane options');
  assert.equal(items.length,1);
  return items[0];
}

test('pane menu toggles headers without changing CSV data or duplicating rows',async()=>{
  const f=fixture(),view=f.plugin.csvViewCreator({});
  assert.equal(paneMenu(view).disabled,true,'disable while no file is loaded');
  view.file={path:'authors.csv'};
  const csv='Name,Count\r\n"Beatriz, ""B""",2\r\nLuis,10';
  await view.loadDataAsync(csv);
  let item=paneMenu(view);
  assert.equal(item.title,'First row contains headers');
  assert.equal(item.checked,false);assert.equal(item.disabled,false);
  item.click();
  assert.equal(paneMenu(view).checked,true);
  assert.equal(view.hot.data.length,2);
  assert.equal(view.getViewData(),csv);
  paneMenu(view).click();
  assert.equal(paneMenu(view).checked,false);
  assert.equal(view.hot.data.length,3);
  assert.equal(view.getViewData(),csv);
});

test('pane menu restores the existing preference per file and acts on its own view',async()=>{
  const f=fixture(),a=f.plugin.csvViewCreator({}),b=f.plugin.csvViewCreator({});
  const csv='Name,Count\r\nAna,2';
  a.file={path:'A.csv'};b.file={path:'B.csv'};
  await a.loadDataAsync(csv);await b.loadDataAsync(csv);
  const menuForA=paneMenu(a);
  menuForA.click();
  assert.equal(paneMenu(a).checked,true);
  assert.equal(paneMenu(b).checked,false);
  const reopened=f.plugin.csvViewCreator({});reopened.file={path:'A.csv'};
  await reopened.loadDataAsync(csv);
  assert.equal(paneMenu(reopened).checked,true);
  assert.equal(reopened.hot.data.length,1);
  assert.equal(reopened.getViewData(),csv);
});
