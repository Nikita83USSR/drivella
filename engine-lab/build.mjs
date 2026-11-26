import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const vendor = path.join(here, "vendor");
const licenses = path.join(here, "licenses");

await mkdir(vendor, { recursive: true });
await mkdir(licenses, { recursive: true });

await build({
  entryPoints: [path.join(here, "src", "main.js")],
  outfile: path.join(vendor, "drivella-engine.js"),
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  treeShaking: true,
  legalComments: "none",
  sourcemap: false,
  metafile: true
});

const copies = [
  [
    path.join(root, "node_modules", "@babylonjs", "havok", "lib", "esm", "HavokPhysics.wasm"),
    path.join(vendor, "HavokPhysics.wasm")
  ],
  [
    path.join(root, "node_modules", "@babylonjs", "core", "LICENSE"),
    path.join(licenses, "BABYLON-APACHE-2.0.txt")
  ],
  [
    path.join(root, "node_modules", "@babylonjs", "havok", "LICENSE"),
    path.join(licenses, "HAVOK-MIT.txt")
  ]
];

for (const [source, destination] of copies) {
  await copyFile(source, destination);
}

console.log("Built self-hosted Babylon.js bundle and copied Havok WASM + license notices.");
