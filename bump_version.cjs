const semver = require("semver");
const fs = require("fs");

const types = [
  "major",
  "premajor",
  "minor",
  "preminor",
  "patch",
  "prepatch",
  "prerelease",
];

let newVersion = undefined;

let rootPackageFile = "./package.json";

// update package.json
const workspacePackageFiles = [
  "./package.json",
  "./packages/interfaces/package.json",
  "./packages/privkey-connector/package.json",
  "./packages/web3modal-connector/package.json",
  "./packages/mainnet-js-signer/package.json",
  "./packages/cashscript-signer/package.json",
];
const workspacePackages = [
  "@bch-wc2/interfaces",
  "@bch-wc2/privkey-connector",
  "@bch-wc2/web3modal-connector",
  "@bch-wc2/mainnet-js-signer",
  "@bch-wc2/cashscript-signer",
];

// Get the package version from the root package

let rootPackage = require(rootPackageFile);
let version = rootPackage.version;
console.log("Old root package version:", version);

if (semver.valid(process.argv[2])) {
  newVersion = process.argv[2];
} else {
  let bumpType = types.includes(process.argv[2]) ? process.argv[2] : "patch";
  let preType = process.argv[3];
  newVersion = semver.inc(rootPackage.version, bumpType, preType);
}
console.log("New root package version:", newVersion);

function updatePackageFile(file) {
  let pckg = require(file);
  pckg.version = newVersion;
  console.log(`Updated ${pckg.name} to version: ${newVersion}`);

  for (const p of workspacePackages) {
    if (pckg.dependencies && p in pckg.dependencies) {
      pckg.dependencies[p] = newVersion;
      console.log(`Updated ${pckg.name} dependency ${p} to ${newVersion}`);
    }
    if (pckg.devDependencies && p in pckg.devDependencies) {
      pckg.dependencies[p] = newVersion;
      console.log(`Updated ${pckg.name} dependency ${p} to ${newVersion}`);
    }
  }

  fs.writeFileSync(file, JSON.stringify(pckg, null, 2) + "\n");
}

updatePackageFile(rootPackageFile);

workspacePackageFiles.forEach((file) => {
  updatePackageFile(file);
});
