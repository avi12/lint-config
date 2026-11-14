import { materialize, clippyFindings } from "./support/rust.js";
for (const f of ["flag", "ok"]) {
  const { directory, problems } = materialize({ fixture: f });
  console.log(f, directory, problems);
  console.log(clippyFindings(directory).join("\n"));
}
