/**
 * Files live on a mounted volume. Names come from randomUUID(), never from the
 * upload, and every path is checked against the configured root before it is
 * touched (SECURITY.md 7.4). Implementation arrives with the upload route in M2-T1.
 */
import type { IFileStorage } from './storage.interface.js';

export class LocalFileStorage implements IFileStorage {
  constructor(private readonly root: string) {}

  save(_buffer: Buffer, _extension: string): Promise<string> {
    throw new Error(`LocalFileStorage.save arrives in M2-T1 (root: ${this.root})`);
  }

  read(_storagePath: string): Promise<Buffer> {
    throw new Error('LocalFileStorage.read arrives in M2-T1');
  }

  remove(_storagePath: string): Promise<void> {
    throw new Error('LocalFileStorage.remove arrives in M2-T1');
  }
}
