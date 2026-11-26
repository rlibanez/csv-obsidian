const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const rendered = [];
  const element = () => ({innerHTML:'',classList:{add(){}},addClass(){},appendChild(){}});
  class TextFileView {
    constructor(leaf) {this.leaf=leaf;this.contentEl=element();this.saves=0;}
    register() {}
    requestSave() {assert.ok(this instanceof TextFileView);this.saves++;}
  }
  class Plugin {
    registerView(type,create) {this.createView=create;this.type=type;}
    registerExtensions(extensions,type) {this.extensions=extensions;assert.equal(type,this.type);}
  }
  class Setting {
    setName() {return this;}
    addToggle(callback) {callback({setValue(){return this;},onChange(){return this;}});return this;}
  }
  class Table {
    constructor(container,settings) {
      this.settings=settings;
      // Auto-column sizing invokes the renderer during table construction,
      // before Obsidian associates the TextFileView with a file.
      for (const value of [undefined,null,42,'**CSV**'])
        settings.renderer(this,element(),0,0,0,value,{});
    }
    getPlugin() {return {};}
  }
  const obsidian={Plugin,TextFileView,Setting,addIcon(){},MarkdownRenderer:{
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
