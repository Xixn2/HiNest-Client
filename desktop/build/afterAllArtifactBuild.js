// 모든 아티팩트(DMG 등) 빌드 후 호출되는 훅.
// DMG 는 electron-builder 가 afterSign 이후에 만들기 때문에 .app 스테이플과는 별개로
// 여기서 DMG 자체도 공증 + 스테이플 해준다.
// (공증 서버는 이미 .app 을 인식하므로 DMG 만 새로 제출 → 티켓이 DMG 에 박혀 오프라인
//  배포 시에도 Gatekeeper 가 네트워크 없이 검증 가능.)

const { execSync } = require("child_process");

const KEYCHAIN_PROFILE = "hinest-notary";

module.exports = async function (context) {
  if (process.platform !== "darwin") return;
  if (process.env.HINEST_SKIP_NOTARIZE === "1") {
    console.log("[afterAllArtifactBuild] HINEST_SKIP_NOTARIZE=1 — 공증 스킵");
    return context.artifactPaths;
  }

  const dmgs = (context.artifactPaths || []).filter((p) => p.endsWith(".dmg"));
  for (const dmg of dmgs) {
    console.log(`[afterAllArtifactBuild] notarytool submit DMG: ${dmg}`);
    try {
      execSync(
        `xcrun notarytool submit "${dmg}" --keychain-profile "${KEYCHAIN_PROFILE}" --wait`,
        { stdio: "inherit" }
      );
      console.log(`[afterAllArtifactBuild] stapling ${dmg}`);
      execSync(`xcrun stapler staple "${dmg}"`, { stdio: "inherit" });
      console.log("[afterAllArtifactBuild] DMG stapled ✔");
    } catch (e) {
      console.error("[afterAllArtifactBuild] DMG notarize/staple failed:", e && e.message ? e.message : e);
      throw e;
    }
  }
  return context.artifactPaths;
};
