declare module "multer" {
  import { RequestHandler } from "express";
  interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
    buffer: Buffer;
  }
  interface StorageEngine {
    _handleFile(req: any, file: any, cb: any): void;
    _removeFile(req: any, file: any, cb: any): void;
  }
  interface MulterOptions {
    dest?: string;
    storage?: StorageEngine;
    limits?: { fileSize?: number; files?: number };
    fileFilter?(req: any, file: File, cb: (err: any, accept: boolean) => void): void;
  }
  interface Multer {
    single(name: string): RequestHandler;
    array(name: string, maxCount?: number): RequestHandler;
    any(): RequestHandler;
  }
  function multer(opts?: MulterOptions): Multer;
  namespace multer {
    function diskStorage(opts: {
      destination: any;
      filename: any;
    }): StorageEngine;
    function memoryStorage(): StorageEngine;
  }
  export = multer;
}

declare namespace Express {
  interface Request {
    file?: any;
    files?: any;
  }
}
