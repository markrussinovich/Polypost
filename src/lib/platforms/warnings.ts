// Re-exported so platform warning rules can import URL detection from one place;
// the implementation (including schemeless/bare-domain matching) lives in urls.ts.
export { containsUrl } from '../urls';
