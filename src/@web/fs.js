import webview_base from '../../resources/webview_base.html';

export function readFileSync(path) {
  if (path.endsWith('webview_base.html')) {
    console.log('using inlined webview base', path)
    return webview_base;
  }
  console.warn('using mocked (empty) file for', path)
  return '';
}