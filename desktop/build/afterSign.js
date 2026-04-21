// 서명 직후에 Apple notary 서비스로 제출 → 승인 대기 → app 에 스테이플.
//
// electron-builder 의 기본 notarize 옵션은 env var (APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD)
// 에 의존하는데, 여기선 키체인 프로필(hinest-notary) 을 쓰고 있어서 afterSign 훅에서
// notarytool 을 직접 돌린다.
//
// 사전 준비 (최초 1회):
//   xcrun notarytool store-credentials hinest-notary \
//     --apple-id <dev apple id> --team-id 3NVCLTSP9V --password <app-specific password>
//
// 이후부터는 `npm run dist:mac` 한 줄로 서명 + 공증 + 스테이플 전부 끝.
// DMG 자체는 electron-builder 가 후속 단계에서 만들고 자동 스테이플 해준다 (afterAllArtifactBuild).

const { execSync } = require("child_process");
const path = require("node:path");

const KEYCHAIN_PROFILE = "hinest-notary";

module.exports = async function (context) {
  if (context.electronPlatformName !== "darwin") return;

  // HINEST_SKIP_NOTARIZE=1 로 공증 스킵 (로컬 빠른 테스트용)
  if (process.env.HINEST_SKIP_NOTARIZE === "1") {
    console.log("[afterSign] HINEST_SKIP_NOTARIZE=1 — 공증 스킵");
    return;
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  console.log(`[afterSign] notarytool submit: ${appPath}`);
  try {
    execSync(
      `xcrun notarytool submit "${appPath}" --keychain-profile "${KEYCHAIN_PROFILE}" --wait`,
      { stdio: "inherit" }
    );
    console.log("[afterSign] notarize accepted — stapling app");
    execSync(`xcrun stapler staple "${appPath}"`, { stdio: "inherit" });
    console.log("[afterSign] app stapled ✔");
  } catch (e) {
    console.error("[afterSign] notarize/staple failed:", e && e.message ? e.message : e);
    throw e;
  }
};
