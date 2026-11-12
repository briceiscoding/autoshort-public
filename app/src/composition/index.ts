// Entry point of the export render bundle.
import {registerRoot} from 'remotion';
import {registerCustomDiagrams} from './custom/registry';
import {customDiagrams} from './custom/registry.generated';
import {Root} from './Root';

registerCustomDiagrams(customDiagrams);
registerRoot(Root);
