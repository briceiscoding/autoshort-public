import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './ui/App';
import {initColorMode} from './ui/colorMode';
import {startLifecycle} from './ui/lifecycle';
import '@fontsource-variable/inter';
import './ui/styles.css';

initColorMode();
startLifecycle();
createRoot(document.getElementById('root')!).render(<App />);
