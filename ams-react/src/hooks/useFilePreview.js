import { useCallback, useEffect, useRef, useState } from 'react';

// A chosen File plus a blob: URL to preview it. The URL is made when the file
// is set and revoked when it is replaced, cleared or the component unmounts.
// Calling URL.createObjectURL() in render made a new, never-released URL on
// every re-render.
//
//   const [file, setFile, previewUrl] = useFilePreview();
export default function useFilePreview() {
  const [state, setState] = useState({ file: null, url: '' });
  const urlRef = useRef('');

  const setFile = useCallback((file) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = file ? URL.createObjectURL(file) : '';
    urlRef.current = url;
    setState({ file: file || null, url });
  }, []);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  return [state.file, setFile, state.url];
}
