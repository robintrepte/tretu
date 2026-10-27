import { backupPaths, CONTAINER_NAME, HOST_BACKUPS, HOST_DATA, HOST_ROOT } from "@/lib/games/runtime";
import { shq } from "@/lib/orchestrator/ssh";

/** Shell script that writes a tar.gz of the save data to HOST_BACKUPS and prints its size. */
export function backupScript(input: { gameType: string; fileName: string; containerRunning: boolean }): string {
  const paths = backupPaths(input.gameType);
  const rcon = (cmd: string) =>
    input.gameType === "minecraft" && input.containerRunning
      ? `docker exec ${CONTAINER_NAME} rcon-cli ${cmd} >/dev/null 2>&1 || true`
      : "true";
  const target = `${HOST_BACKUPS}/${shq(input.fileName)}`;

  const selection = paths.length
    ? `SEL=(); for p in ${paths.map(shq).join(" ")}; do [ -e "$p" ] && SEL+=("$p"); done; [ \${#SEL[@]} -gt 0 ] || { echo "Noch keine Spielstände vorhanden." >&2; exit 3; }`
    : "SEL=(.)";

  return [
    "set -euo pipefail",
    `mkdir -p ${HOST_BACKUPS}`,
    `cd ${HOST_DATA}`,
    selection,
    // Minecraft: flush the world to disk and pause autosaves while archiving.
    rcon("save-off"),
    rcon('"save-all flush"'),
    `trap '${rcon("save-on")}' EXIT`,
    "sleep 2",
    // tar exits 1 when files change while reading (live world) – that is fine.
    `tar -czf ${target}.part "\${SEL[@]}" || [ $? -eq 1 ]`,
    `mv ${target}.part ${target}`,
    `stat -c %s ${target}`,
  ].join("\n");
}

/**
 * Shell script that restores a backup. The archive is unpacked next to the data first, so a broken
 * archive never leaves the server without its previous data.
 */
export function restoreScript(input: { gameType: string; fileName: string }): string {
  const paths = backupPaths(input.gameType);
  const file = `${HOST_BACKUPS}/${shq(input.fileName)}`;
  const staging = `${HOST_ROOT}/restore.tmp`;
  const lines = [
    "set -euo pipefail",
    `test -f ${file}`,
    `rm -rf ${staging} && mkdir -p ${staging}`,
    `tar -xzf ${file} -C ${staging}`,
  ];
  if (paths.length) {
    // Partial backups (save data only): swap just those paths, keep the game files.
    for (const p of paths) {
      lines.push(
        `if [ -e ${staging}/${shq(p)} ]; then rm -rf ${HOST_DATA}/${shq(p)}; mkdir -p "$(dirname ${HOST_DATA}/${shq(p)})"; mv ${staging}/${shq(p)} ${HOST_DATA}/${shq(p)}; fi`
      );
    }
    lines.push(`rm -rf ${staging}`);
  } else {
    lines.push(
      `rm -rf ${HOST_ROOT}/data.old`,
      `mv ${HOST_DATA} ${HOST_ROOT}/data.old`,
      `mv ${staging} ${HOST_DATA}`,
      `rm -rf ${HOST_ROOT}/data.old`
    );
  }
  return lines.join("\n");
}
