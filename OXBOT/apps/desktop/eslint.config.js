import js from '@eslint/js';
import ts from 'typescript-eslint';
const node = { process: 'readonly', console: 'readonly', Buffer: 'readonly' };
export default ts.config({ ignores: ['dist', 'release', 'test-results', 'assets'] }, js.configs.recommended, ...ts.configs.recommended, { files: ['scripts/**/*.mjs'], languageOptions: { globals: node } });
