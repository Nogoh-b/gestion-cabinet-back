import { join } from "path";

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
export const DEFAULT_LANGUAGE = 'fr';
export const UPLOAD_FOLDER_NAME = 'uploads';
export const UPLOAD_DOCS_FOLDER_NAME = 'docs';
export const ROOT_PATH = join(process.cwd());
// export const ROOT_PATH = join(__dirname, '..','..','..');
export const UPLOAD_PATH = join(ROOT_PATH, UPLOAD_FOLDER_NAME) ;
export const UPLOAD_DOCS_PATH = join(UPLOAD_PATH, UPLOAD_DOCS_FOLDER_NAME) ;




