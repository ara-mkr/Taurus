import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default ts.config({ ignores: ['dist', 'test-results', 'playwright-report'] }, js.configs.recommended, ...ts.configs.recommended, { files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'], plugins: { 'react-hooks': hooks }, rules: hooks.configs.recommended.rules });
