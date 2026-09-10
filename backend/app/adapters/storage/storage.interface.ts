/** File storage behind an interface; the local volume is the only implementation. */
export interface IFileStorage {
  save(buffer: Buffer, extension: string): Promise<string>;
  read(storagePath: string): Promise<Buffer>;
  remove(storagePath: string): Promise<void>;
}
