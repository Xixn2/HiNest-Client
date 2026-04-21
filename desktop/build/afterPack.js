// 서명 직전에 macOS extended attributes (resource fork, com.apple.provenance 등) 전부 털어내기.
// Electron 바이너리 다운로드 시 quarantine / provenance 속성이 묻어나와 codesign 실패하는 현상 방지.
//
// NOTE: 예전엔 `find | xargs -I {}` 로 파일별로 xattr -d 를 호출했지만
// Helper (GPU).app 같은 공백 포함 경로가 수만 개라 "xargs: command line
// cannot be assembled, too long" 에러가 나고, 결과적으로 resource fork 가
// 남아 codesign 이 실패함. find -exec … {} + 는 xargs 없이 길이 제한을
// 알아서 관리하므로 그쪽으로 전환.
const { execSync } = require("child_process");

function run(cmd) {
  try {
    execSync(cmd, { shell: "/bin/bash", stdio: "ignore" });
  } catch {
    // best-effort — 속성이 없으면 xattr -d 가 1 을 반환하는 게 정상
  }
}

module.exports = async function (context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  try {
    // 1. 개별 속성 제거 — find -exec {} + 로 배치 처리, xargs 길이 제한 회피
    run(`find "${appPath}" -exec xattr -d com.apple.provenance {} + 2>/dev/null || true`);
    run(`find "${appPath}" -exec xattr -d com.apple.quarantine {} + 2>/dev/null || true`);
    run(`find "${appPath}" -exec xattr -d com.apple.FinderInfo {} + 2>/dev/null || true`);
    run(`find "${appPath}" -exec xattr -d com.apple.ResourceFork {} + 2>/dev/null || true`);
    // 2. 일괄 xattr -c
    run(`xattr -cr "${appPath}"`);
    // 3. 잔여 .DS_Store / __MACOSX 정리
    run(`find "${appPath}" -name ".DS_Store" -delete 2>/dev/null || true`);
    run(`find "${appPath}" -name "__MACOSX" -type d -prune -exec rm -rf {} + 2>/dev/null || true`);
    // 4. resource fork 강제 정리
    run(`dot_clean -m "${appPath}" 2>/dev/null || true`);
    // 5. AppleDouble (._*) 파일 — codesign detritus 의 주범
    run(`find "${appPath}" -name "._*" -delete 2>/dev/null || true`);
    console.log("[afterPack] xattrs + provenance cleaned for", appPath);
  } catch (e) {
    console.error("[afterPack] cleanup failed", e && e.message ? e.message : e);
  }
};
