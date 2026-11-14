import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Where a tool's jar lives in `cacheDirectory`. Pure. */
export function toolPath({ cacheDirectory, tool }) {
  return `${cacheDirectory}/${tool.file}`;
}

/** The SHA-256 of a file's bytes, in hex. */
export async function fileHash(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

/** Downloads `url` to `file`, following redirects; rejects on a non-200 answer. */
export async function downloadFile({ url, file }) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`${url} answered ${response.status}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
}

const REAL_DEPENDENCIES = {
  hashFile: fileHash,
  download: downloadFile,
  makeDirectory: directory => mkdir(directory, { recursive: true }),
  move: (from, to) => rename(from, to),
  remove: file => rm(file, { force: true })
};

/**
 * The path of a verified jar for `tool` (`{ file, url, sha256 }`) in `cacheDirectory`: a cached file whose SHA-256
 * matches is used as it is; a missing or corrupt one is downloaded to a `.part` file, verified and moved into place,
 * and a download that does not match the pinned hash is deleted and rejected. `dependencies` replaces the file
 * system and network for a test.
 */
export async function ensureTool({ tool, cacheDirectory, dependencies = REAL_DEPENDENCIES }) {
  const target = toolPath({
    cacheDirectory,
    tool
  });
  const cached = await dependencies.hashFile(target).catch(() => undefined);
  const isCached = cached === tool.sha256;
  if (isCached) {
    return target;
  }

  await dependencies.makeDirectory(cacheDirectory);
  const partial = `${target}.part`;
  await dependencies.download({
    url: tool.url,
    file: partial
  });
  const downloaded = await dependencies.hashFile(partial);
  const isTrusted = downloaded === tool.sha256;
  if (!isTrusted) {
    await dependencies.remove(partial);
    throw new Error(`${tool.file} has SHA-256 ${downloaded}, expected ${tool.sha256}`);
  }

  await dependencies.move(partial, target);
  return target;
}
