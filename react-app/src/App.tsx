import React, {FormEvent, useCallback, useMemo, useState} from 'react';
import './App.scss';
import {
  Button,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText, MenuItem,
  Paper, Select,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@material-ui/core";
import {Connection} from './model/connection';
import Database, {Field, Schema, Table} from './model/database';
import {connect, getFields, getTables, stringifyError} from './api/api';
import LoadingButton from './component/loading/LoadingButton';
import {useCounter, useLoading} from './component/loading/loading';
import LoadingContainer from './component/loading/LoadingContainer';
import {Alert, AlertTitle} from '@material-ui/lab';
import KeyboardBackspaceIcon from '@material-ui/icons/KeyboardBackspace';
import MonacoEditor from 'react-monaco-editor';
import * as monacoEditor from 'monaco-editor';
import {EditorConstructionOptions} from 'react-monaco-editor/src/types';

// 默认回填的数据
const DEFAULT_VALUE: Connection = {
  host: 'localhost',
  port: 3306,
  username: 'root',
  password: undefined,
};

// 预设的依赖内容
const PRESET_DEFINITIONS = `
/**
 * 将下划线字符串转为驼峰
 * @param {string} str 要被转换的字符串
 * @param {boolean} firstUpper 首字母是否大写
 */
export function toCamelCase(str, firstUpper = false) {
  if (!str) return '';
  const pieces = str.split(/_/g);
  let firstDidUpper = false;
  return pieces.map((value => {
    if (value) {
      if (!firstDidUpper) {
        firstDidUpper = true;
        if (!firstUpper) return value;
      }
      return value[0].toUpperCase() + value.substring(1);
    }
    return undefined;
  })).filter(i => !!i).reduce((p, c) => p + c, '');
}

/**
 * 将驼峰字符串转为下划线
 * @param {string} str 要被转换的字符串
 * @param {boolean} upper 是否转换为大写
 */
export function toUnderlineCase(str, upper = false) {
  return str ? str.replace(/([A-Z])/g, '_$1')[upper ? 'toUpperCase' : 'toLowerCase']() : '';
}
`;

// 结果内容支持语法高亮的语言
const LANGUAGES = Array.from(new Set(monacoEditor.languages.getLanguages().map(i => i.id.toLowerCase())));

export default function App() {

  const [loading, load, loaded] = useLoading();

  // 重新加载结果编辑器的依赖内容
  const [rk, plus] = useCounter();
  // 重新加载编辑器的依赖内容
  const [editorReloadKey, reloadEditor] = useCounter();

  // 注入到编辑器的依赖内容
  const [definitions, setDefinitions] = useState(PRESET_DEFINITIONS);

  // region 数据库

  // 连接信息表单错误信息
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  // 需要而外提示的错误信息
  const [errorMessage, setEM] = useState('');

  // 连接信息
  const [, setConn] = useState<Connection>({});
  // 连接了的数据库信息
  const [database, setDatabase] = useState<Database | undefined>(undefined);
  // 当前选中的schema
  const [schema, setSchema] = useState<Schema | undefined>(undefined);
  // table列表
  const [tables, setTables] = useState<Table[] | undefined>(undefined);
  // 当前选中的table
  const [table, setTable] = useState<Table | undefined>(undefined);
  // fields列表
  const [fields, setFields] = useState<Field[] | undefined>(undefined);

  const promiseHandler = useCallback<(<T> (promise: Promise<T>) => Promise<T>)>((promise: Promise<any>) => {
    const rk = load();
    return new Promise((resolve, reject) => {
      promise
        .then(db => {
          setEM('');
          resolve(db);
        })
        .catch(e => {
          setEM(stringifyError(e));
          reject(e);
        })
        .finally(() => {
          loaded(rk);
        });
    });
  }, [load, loaded]);

  const onConnectionInfoSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();

    const target: any = e.target;
    const data: Connection = Object.keys(DEFAULT_VALUE).reduce((p, c) => ({ ...p, [c]: target[c]?.value }), {});

    const newErrors: Record<string, boolean> = {};

    if (!data.host) {
      newErrors.host = true;
    } else if (!data.port) {
      newErrors.port = true;
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length) {
      return;
    }

    setConn(data);

    setDatabase(undefined);
    promiseHandler(connect(data)).then(db => {
      setDatabase(db);
    });
  }, [promiseHandler]);

  const onDatabaseClick = useCallback((schema: Schema) => {
    setSchema(schema);
    promiseHandler(getTables(schema.name!)).then(tables => setTables(tables));
  }, [promiseHandler]);

  const onTableClick = useCallback((table: Table) => {
    setTable(table);
    promiseHandler(getFields(table.name!)).then(fields => setFields(fields));
  }, [promiseHandler]);

  // 将当前显示字段的表的数据导入编辑器依赖
  const setEditorDefinitions = useCallback(() => {
    if (!fields) {
      setEM('当前未加载任何Table, 无法导入依赖!');
      return;
    }

    setDefinitions(`
// 数据库数据
export const database = ${JSON.stringify(database, undefined, 4)};

// 表数据
export const table = ${JSON.stringify(table, undefined, 4)};

// 字段列表
export const fields = ${JSON.stringify(fields, undefined, 4)};

// 预设的方法
${PRESET_DEFINITIONS}
`);
    reloadEditor();
  }, [
    database, table, fields,
    reloadEditor, setEM,
  ]);

  const ele = useMemo(() =>
      <LoadingContainer style={{padding: '5px'}} loading={loading}>
        {database ?
          <>
            <Typography color="textSecondary">{database.name}</Typography>
            <Divider />
            {tables ?
              <>
                {fields ?
                  <List component="nav">
                    <ListItem button onClick={() => setFields(undefined)}>
                      <ListItemText primary={
                        <div className="text-with-icon">
                          <KeyboardBackspaceIcon className="icon"/>
                          <span>返回</span>
                        </div>
                      } secondary={table?.name} />
                    </ListItem>
                    <ListItem button onClick={() => setEditorDefinitions()}>
                      <ListItemText primary="将该表数据注入至模板编辑器依赖" secondary="该操作将覆盖已有依赖" />
                    </ListItem>
                    {fields.map((field, index) =>
                      <ListItem key={index} button>
                        <ListItemText style={{paddingLeft: '20px'}} primary={`${field.name}${field.nullable ? '?' : ''}: ${field.type}`} />
                      </ListItem>)}
                  </List>
                  :
                  <List component="nav">
                    <ListItem button onClick={() => setTables(undefined)}>
                      <ListItemText primary={
                        <div className="text-with-icon">
                          <KeyboardBackspaceIcon className="icon"/>
                          <span>返回</span>
                        </div>
                      } />
                    </ListItem>
                    {tables.map((table, index) =>
                      <ListItem key={index} button onClick={() => onTableClick(table)}>
                        <ListItemText style={{paddingLeft: '20px'}} primary={`${schema?.name}.${table.name}`} />
                      </ListItem>)}
                  </List>
                }
              </>
              :
              <List component="nav">
                {database.schemas.map((schema, index) =>
                  <ListItem key={index} button
                            onClick={() => onDatabaseClick(schema)}>
                    <ListItemText primary={schema.name} />
                  </ListItem>)}
              </List>
            }
          </>
          :
          <Typography color={'textSecondary'} align={'center'} style={{padding: '10px 0'}}>请先建立连接</Typography>
        }
      </LoadingContainer>,
    [
      loading,
      onDatabaseClick, onTableClick, setEditorDefinitions,
      database, schema, tables, table, fields,
    ]
  );

  // endregion

  // region 文本编辑器

  const [tplEditor, setTplEditor] = useState<monacoEditor.editor.IStandaloneCodeEditor | undefined>(undefined);
  const tplEditorWillMount = useCallback((monaco: typeof monacoEditor): EditorConstructionOptions => {
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2016,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
    });
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      definitions,
      'file:///node_modules/dbtpl/index.js'
    );
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({

    });

    const model = monaco.editor.createModel(
      `"use strict"\nimport {database, table, fields, toCamelCase, toUnderlineCase} from 'dbtpl';\nlet tpl = \`\`;\nreturn tpl;`,
      'javascript',
      monaco.Uri.parse(`file:///main-${Date.now()}.js`)
    );

    return {
      model,
      minimap: {
        enabled: false,
      },
      language: 'javascript',
    };
  }, [definitions]);
  const tplEditorDidMount = useCallback((editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: typeof monacoEditor) => {
    console.log('tplEditorDidMount', editor, monaco);
    setTplEditor(oldEditor => {
      try {
        oldEditor?.dispose();
      } catch (e) {
        console.error('error on dispose template editor:', e);
      }
      return editor;
    });
  }, []);

  // endregion

  // region 依赖内容和模板结果

  const [tab, setTab] = useState(0);
  const handleTabChange = useCallback((e, nv) => setTab(nv), []);

  const [, setDepEditor] = useState<monacoEditor.editor.IStandaloneCodeEditor | undefined>(undefined);

  const [resultEditor, setResultEditor] = useState<monacoEditor.editor.IStandaloneCodeEditor | undefined>(undefined);
  const [result, setResult] = useState('');
  const [resultType, setResultType] = useState('javascript');

  const depEditorWillMount = useCallback((/*monaco: typeof monacoEditor*/): EditorConstructionOptions => {
    return {
      value: definitions || PRESET_DEFINITIONS,
      readOnly: true,
      minimap: {
        enabled: false,
      },
      language: 'javascript',
    };
  }, [definitions]);
  const depEditorDidMount = useCallback((editor: monacoEditor.editor.IStandaloneCodeEditor) => {
    setDepEditor(oldEditor => {
      try {
        oldEditor?.dispose();
      } catch (e) {
        console.error('error on dispose dependency editor:', e);
      }
      return editor;
    });
  }, []);

  const onResultTypeChange = useCallback(e => {
    setResultType(e.target.value);
    setResult(resultEditor?.getValue() || '');
    plus();
  }, [plus, resultEditor]);
  const resultEditorWillMount = useCallback((/*monaco: typeof monacoEditor*/): EditorConstructionOptions => {
    return {
      value: `${result}`,
      minimap: {
        enabled: false,
      },
      language: resultType,
    };
  }, [result, resultType]);
  const resultEditorDidMount = useCallback((editor: monacoEditor.editor.IStandaloneCodeEditor) => {
    setResultEditor(oldEditor => {
      try {
        oldEditor?.dispose();
      } catch (e) {
        console.error('error on dispose result editor:', e);
      }
      return editor;
    });
  }, []);

  const printResult = useCallback(() => {
    if (tplEditor) {
      try {
        const source = tplEditor.getValue();
        const sourceCode = `
          ${definitions}
          ${source}
        `.replace(/(?<=\n) *((import.+?;)|export )/g, '');
        console.log(sourceCode);
        const r = new Function(sourceCode)();
        if (r === undefined) {
          setEM('没有找到return语句');
        } else {
          setResult(r);
          plus();
          setEM('');
        }
      } catch (e) {
        setEM(stringifyError(e));
      }
    } else {
      setEM('编辑器暂时未初始化完成');
    }
  }, [definitions, tplEditor, plus]);

  // endregion

  return (
    <div className="code-generator-wrapper">
      <Grid container spacing={2}>
        <Grid item xs={12} lg={4} xl={3}>
          <Alert severity={errorMessage ? 'error' : 'success'}>
            <AlertTitle>{errorMessage ? '错误' : '正常'}</AlertTitle>
            {errorMessage || '一切正常'}
          </Alert>
          <Paper>
            <Typography variant="h6" color="textPrimary">连接信息</Typography>
            <form className={`form-wrapper`} onSubmit={onConnectionInfoSubmit}>
              <Grid container spacing={2}>
                <Grid item xs={8}>
                  <TextField required label="Host" name={'host'} defaultValue={DEFAULT_VALUE.host}
                             error={errors.host} helperText={'Host is required'} />
                </Grid>
                <Grid item xs={4}>
                  <TextField required type={'number'} label="Port" name={'port'}
                             defaultValue={DEFAULT_VALUE.port!.toString()}
                             error={errors.port} helperText={'Port is required'} />
                </Grid>
                <Grid item xs={6}>
                  <TextField label="Username" name={'username'} defaultValue={DEFAULT_VALUE.username} />
                </Grid>
                <Grid item xs={6}>
                  <TextField label="Password" name={'password'} defaultValue={DEFAULT_VALUE.password} />
                </Grid>
                <Grid item xs={12}>
                  <div className="form-buttons">
                    <LoadingButton loading={loading}
                                   variant="contained" color="primary"
                                   type={'submit'}>连接</LoadingButton>
                  </div>
                </Grid>
              </Grid>
            </form>
          </Paper>
          <Paper className="paper-item">
            <Typography variant="h6" color="textPrimary">数据库信息</Typography>
            {ele}
          </Paper>
        </Grid>
        <Grid item xs={12} lg={8} xl={9}>
          <Grid container spacing={2}>
            <Grid item xs={12} lg={6}>
              <Paper>
                <div className="typo-with-right-button">
                  <Typography variant="h6" color="textPrimary">模板(javascript w/ CommonJS)</Typography>
                  <div>
                    <Button variant={'contained'} color={'primary'} onClick={printResult}>输出结果</Button>
                  </div>
                </div>
                <div className="editor-wrapper">
                  <MonacoEditor key={editorReloadKey} height={500}
                                editorWillMount={tplEditorWillMount}
                                editorDidMount={tplEditorDidMount}/>
                </div>
              </Paper>
            </Grid>
            <Grid item xs={12} lg={6}>
              <Paper style={{paddingTop: '8px'}}>
                <div className="typo-with-right-button">
                  <Tabs value={tab} onChange={handleTabChange}>
                    <Tab label="注入的内容" />
                    <Tab label="模板输出结果" />
                  </Tabs>
                  <div>
                    <Select value={resultType} onChange={onResultTypeChange}>
                      {LANGUAGES.map(language => <MenuItem value={language} key={language}>{language}</MenuItem>)}
                    </Select>
                  </div>
                </div>
                <div className="editor-wrapper">
                  {tab === 0 ? <>
                    <MonacoEditor key={editorReloadKey} height={500}
                                  editorDidMount={depEditorDidMount}
                                  editorWillMount={depEditorWillMount}/>
                  </> : <></>}
                  {tab === 1 ? <>
                    <MonacoEditor key={rk} height={500}
                                  editorWillMount={resultEditorWillMount}
                                  editorDidMount={resultEditorDidMount}/>
                  </> : <></>}
                </div>
              </Paper>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </div>
  );
}
