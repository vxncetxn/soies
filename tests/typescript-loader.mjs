const opSqliteStub = new URL("./stubs/op-sqlite.mjs", import.meta.url).href;
const storageFilesStub = new URL("./stubs/storage-files.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@op-engineering/op-sqlite") {
    return { url: opSqliteStub, shortCircuit: true };
  }

  if (
    specifier === "../../storage/files" &&
    context.parentURL?.endsWith("/src/db/repositories/artefacts.ts")
  ) {
    return { url: storageFilesStub, shortCircuit: true };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
