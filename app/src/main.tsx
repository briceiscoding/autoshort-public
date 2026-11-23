import React from 'react';
import {createRoot} from 'react-dom/client';
import {registerStyleComponents} from './composition/formats/style';
import {App} from './ui/App';
import {initColorMode} from './ui/colorMode';
import {startLifecycle} from './ui/lifecycle';
import '@fontsource-variable/inter';
import './ui/styles.css';

// YouTube 16:9 style made from the references: reloaded by Vite when Claude rewrites a component.
registerStyleComponents(import.meta.glob('../../theme/landscape/components/*.tsx', {eager: true}));

initColorMode();
startLifecycle();
createRoot(document.getElementById('root')!).render(<App />);
