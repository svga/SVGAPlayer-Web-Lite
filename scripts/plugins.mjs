import { injectParser } from './inject-parser.mjs';

export function inlineParserPlugin() {
  return {
    name: 'inline-parser-plugin',
    writeBundle(options, bundle) {
      if (options.file === '__test__/index.js') {
        try {
          console.log('inlineParserPlugin: Running injectParser for __test__/index.js...');
          injectParser();
          console.log('inlineParserPlugin: injectParser completed.');
        } catch (error) {
          console.error('inlineParserPlugin: Error during injectParser:', error);
          this.error('Failed to inject parser into the test bundle.'); // Use Rollup's error handling
        }
      }
    }
  };
}
