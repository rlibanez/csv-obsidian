import { Plugin, WorkspaceLeaf, addIcon, TextFileView, Menu, MarkdownRenderer } from 'obsidian';
import * as Papa from 'papaparse';
import Handsontable from "handsontable";
import './styles.scss'

export default class CsvPlugin extends Plugin {

  async onload() {

    // register a custom icon
    this.addDocumentIcon("csv");

    // register the view and extensions
    this.registerView("csv", this.csvViewCreator);
    this.registerExtensions(["csv"], "csv");
  }

  // function to create the view
  csvViewCreator = (leaf: WorkspaceLeaf) => {
    return new CsvView(leaf);
  }

  // this function used the regular 'document' svg,
  // but adds the supplied extension into the icon as well
  addDocumentIcon = (extension: string) => {
    addIcon(`document-${extension}`, `
  <path fill="currentColor" stroke="currentColor" d="M14,4v92h72V29.2l-0.6-0.6l-24-24L60.8,4L14,4z M18,8h40v24h24v60H18L18,8z M62,10.9L79.1,28H62V10.9z"></path>
  <text font-family="sans-serif" font-weight="bold" font-size="30" fill="currentColor" x="50%" y="60%" dominant-baseline="middle" text-anchor="middle">
    ${extension}
  </text>
    `);
  }
}

// This is the custom view
class CsvView extends TextFileView {

  parseResult: any;
  hot: Handsontable;
  hotSettings: Handsontable.GridSettings;
  hotExport: Handsontable.plugins.ExportFile;
  hotState: Handsontable.plugins.PersistentState;
  hotFilters: Handsontable.plugins.Filters;
  loadingBar: HTMLElement;

  // this.contentEl is not exposed, so cheat a bit.
  public get extContentEl(): HTMLElement {
    // @ts-ignore
    return this.contentEl;
  }

  // constructor
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.onResize = () => {
      if (this.hot) {
        this.hot.refreshDimensions();
        this.hot.render();
      }
    }
    this.loadingBar = document.createElement('div');
    this.loadingBar.addClass("progress-bar");
    this.loadingBar.innerHTML = `<div class="progress-bar-message u-center-text">Loading CSV...</div><div class="progress-bar-indicator"><div class="progress-bar-line"></div><div class="progress-bar-subline" style="display: none;"></div><div class="progress-bar-subline mod-increase"></div><div class="progress-bar-subline mod-decrease"></div></div>`
    this.extContentEl.appendChild(this.loadingBar);

    const tableContainer = document.createElement('div');
    tableContainer.classList.add('csv-table-wrapper');
    this.extContentEl.appendChild(tableContainer);

    const hotContainer = document.createElement('div');
    tableContainer.appendChild(hotContainer);


    // A separate portal keeps popup menus unclipped and scoped to this CSV view.
    const menuContainer = document.createElement('div');
    menuContainer.classList.add('csv-editor-menus');
    document.body.appendChild(menuContainer);
    this.register(() => menuContainer.remove());
    const menuOptions = { uiContainer: menuContainer };

    this.hotSettings = {
      afterChange: this.hotChange,
      afterColumnSort: () => this.requestSave(),
      afterColumnMove: () => this.requestSave(),
      afterRowMove:   () => this.requestSave(),
      afterCreateCol: () => this.requestSave(),
      afterCreateRow: () => this.requestSave(),
      afterRemoveCol: () => this.requestSave(),
      afterRemoveRow: () => this.requestSave(),
      licenseKey: 'non-commercial-and-evaluation',
      colHeaders: true,
      rowHeaders: true,
      autoColumnSize: true,
      autoRowSize: true,
      rowHeights: 32,
      columnHeaderHeight: 34,
      rowHeaderWidth: 44,
      colWidths: 160,
      stretchH: 'none',
      renderer: this.markdownCellRenderer,
      // The old MarkdownView cell editor relied on removed Obsidian internals.
      editor: 'text',
      className: 'csv-table',
      contextMenu: menuOptions,
      currentRowClassName: 'active-row',
      currentColClassName: 'active-col',
      columnSorting: true,
      dropdownMenu: menuOptions,
      filters: true,
      manualColumnFreeze: true,
      manualColumnMove: false,  // moving columns causes too many headaches for now
      manualColumnResize: true,
      manualRowMove: false,  // moving rows causes too many headaches for now
      manualRowResize: true,
      persistentState: true,
      // preventOverflow: true,
      search: true, // TODO:290 Hijack the search ui from markdown views,
      // A numeric viewport avoids collapsed percentage heights in flex panes.
      height: () => tableContainer.clientHeight,
      width: '100%',
    }
    this.hot = new Handsontable(hotContainer, this.hotSettings);
    this.hotExport = this.hot.getPlugin('exportFile');
    this.hotState = this.hot.getPlugin('persistentState');
    this.hotFilters = this.hot.getPlugin('filters');

  }

  onPaneMenu(menu: Menu, source: string): void {
    super.onPaneMenu(menu, source);
    menu.addItem(item => item
      .setTitle('First row contains headers')
      .setIcon('table')
      .setChecked(this.hotSettings.colHeaders !== true)
      .setDisabled(!this.file || !this.parseResult)
      .onClick(() => this.toggleHeaders(this.hotSettings.colHeaders === true)));
  }

  hotChange = (changes: Handsontable.CellChange[], source: Handsontable.ChangeSource) => {
    if (source === 'loadData') {
      return; //don't save this change
    }
    this.requestSave();
  }

  toggleHeaders = (value: boolean) => {
    value = value || false; // just in case it's undefined
    // turning headers on
    if (value) {
      // we haven't specified headers yet
      if (this.hotSettings.colHeaders === true) {
        // get the data
        let data = this.hot.getSourceDataArray();
        // take the first row off the data to use as headers
        this.hotSettings.colHeaders = data.shift();
        // reload the data without this first row
        this.hot.loadData(data);
        // update the settings
        this.hot.updateSettings(this.hotSettings);
      }
    }
    // turning headers off
    else {
      // we have headers
      if (this.hotSettings.colHeaders !== true) {
        // get the data
        let data = this.hot.getSourceDataArray();
        // put the headings back in as a row
        data.unshift(this.hot.getColHeader());
        // specify true to just display alphabetical headers
        this.hotSettings.colHeaders = true;
        // reload the data with this new first row
        this.hot.loadData(data);
        // update the settings
        this.hot.updateSettings(this.hotSettings);
      }
    }

    // set this value to the state
    this.hotState.saveValue('hasHeadings', value);
  }

  // get the new file contents
  getViewData = () => {
    // get the *source* data (i.e. unfiltered)
    let data = this.hot.getSourceDataArray();
    if (this.hotSettings.colHeaders !== true) {
      data.unshift(this.hot.getColHeader());
    }

    let csvString = Papa.unparse(data);

    return csvString;
    // return Papa.unparse({fields: this.parseResult.fields, data: this.parseResult.data}, {header: false});
    // return Papa.unparse(this.parseResult);
  }

  // set the file contents
  setViewData = (data: string, clear: boolean) => {
    this.loadingBar.show();
    setTimeout(() => this.loadDataAsync(data).then(() => this.loadingBar.hide()), 50);
  }

  loadDataAsync = async (data: string) => {
    return new Promise<void>((resolve, reject) => {
      // for the sake of persistent settings we need to set the root element id
      this.hot.rootElement.id = this.file.path;
      this.hotSettings.colHeaders = true;

      // strip Byte Order Mark if necessary (damn you, Excel)
      if (data.charCodeAt(0) === 0xFEFF) data = data.slice(1);

      // parse the incoming data string
      Papa.parse(data, {
        header: false,
        complete: results => {
          this.parseResult = results;
          // load the data into the table
          this.hot.loadData(this.parseResult.data);
          // we also need to update the settings so that the persistence will work
          this.hot.updateSettings(this.hotSettings);

          // load the persistent setting for headings
          let hasHeadings = { value: false };
          this.hotState.loadValue('hasHeadings', hasHeadings);

          // toggle the headers on or off based on the loaded value
          this.toggleHeaders(hasHeadings.value)
          resolve();
        },
        error: (error: Error) => {
          reject(error);
        }
      });
    });
  }

  markdownCellRenderer = (instance: Handsontable, TD: HTMLTableCellElement, row: number, col: number, prop: string | number, value: Handsontable.CellValue, cellProperties: Handsontable.CellProperties): HTMLTableCellElement | void => {
    TD.innerHTML = '';
    // Handsontable measures cells before Obsidian assigns a file to this view.
    MarkdownRenderer.renderMarkdown(String(value ?? ''), TD, this.file?.path ?? '', this);
    return TD;
  }

  // clear the view content
  clear = () => {

  }

  // gets the title of the document
  getDisplayText() {
    if (this.file) return this.file.basename;
    else return "csv (no file)";
  }

  // confirms this view can accept csv extension
  canAcceptExtension(extension: string) {
    return extension == 'csv';
  }

  // the view type name
  getViewType() {
    return "csv";
  }

  // icon for the view
  getIcon() {
    return "document-csv";
  }
}
