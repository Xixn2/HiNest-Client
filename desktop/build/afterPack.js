// 서명 직전에 macOS extended attributes (resource fork, com.apple.provenance 등) 전부 털어내기.
// Electron 바이너리 다운로드 시 quarantine / provenance 속성이 묻어나와 codesign 실패하는 현상 방지.
const { execSync } = require("child_process");

module.exports = async function (context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  try {
    // 1. 개별 속성을 하나씩 제거 (일부는 xattr -c 로도 지워지지 않음)
    execSync(
      `find "${appPath}" -print0 | xargs -0 -I {} sh -c 'xattr -d com.apple.provenance "{}" 2>/dev/null; xattr -d com.apple.quarantine "{}" 2>/dev/null; xattr -d com.apple.FinderInfo "{}" 2>/dev/null; true'`,
      { shell: "/bin/bash" }
    );
    // 2. 일괄 xattr -c
    execSync(`xattr -cr "${appPath}"`);
    // 3. 잔여 .DS_Store / __MACOSX 정리
    execSync(`find "${appPath}" -name ".DS_Store" -delete 2>/dev/null || true`, { shell: "/bin/bash" });
    execSync(`find "${appPath}" -name "__MACOSX" -type d -prune -exec rm -rf {} + 2>/dev/null || true`, { shell: "/bin/bash" });
    // 4. resource fork 강제 정리
    execSync(`dot_clean -m "${appPath}" 2>/dev/null || true`, { shell: "/bin/bash" });
    console.log("[afterPack] xattrs + provenance cleaned for", appPath);
  } catch (e) {
    console.error("[afterPack] cleanup failed", e && e.message ? e.message : e);
  }
};
