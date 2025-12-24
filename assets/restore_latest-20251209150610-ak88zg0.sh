#!/bin/bash

# ========== 配置区 ==========
SOURCE_DIRS=(
    "webapihost"
    "webclient"
    "scheduleserver1055"
    "scheduleserver1050"
)

BACKUP_ROOT="/opt/smom/server/备份文件夹"
# =========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$BACKUP_ROOT" ]; then
    echo "❌ 备份根目录不存在: $BACKUP_ROOT"
    exit 1
fi

mapfile -t BACKUPS < <(find "$BACKUP_ROOT" -maxdepth 1 -type d -name "????-??-??_??????" 2>/dev/null | sort -r)

if [ ${#BACKUPS[@]} -eq 0 ]; then
    echo "❌ 未找到任何备份目录（格式要求：YYYY-MM-DD_HHMMSS）"
    exit 1
fi

echo "🔍 发现 ${#BACKUPS[@]} 个备份版本："
echo "----------------------------------------"
for i in "${!BACKUPS[@]}"; do
    printf "%2d) %s\n" $((i+1)) "${BACKUPS[i]}"
done
echo "----------------------------------------"

while true; do
    read -p "请选择要还原的备份编号（1-${#BACKUPS[@]}），或输入 q 退出: " choice

    if [[ "$choice" == "q" || "$choice" == "Q" ]]; then
        echo "❌ 操作已取消。"
        exit 0
    fi

    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#BACKUPS[@]} ]; then
        SELECTED_BACKUP="${BACKUPS[$((choice-1))]}"
        break
    else
        echo "⚠️  无效输入，请输入 1 到 ${#BACKUPS[@]} 之间的数字，或 q 退出。"
    fi
done

echo
echo "🔄 你选择了: $SELECTED_BACKUP"
echo "⚠️  警告：此操作将覆盖原始位置的现有文件！"
# ✅ 关键修改：用普通 read，必须按回车
read -p "确认还原？(y/N): " REPLY

if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    echo "❌ 操作已取消。"
    exit 0
fi

# ✅ 输出格式完全保持原样（你要的！）
for src in "${SOURCE_DIRS[@]}"; do
    if [[ "$src" != /* ]]; then
        ORIG_PATH="$SCRIPT_DIR/$src"
    else
        ORIG_PATH="$src"
    fi

    BACKUP_ITEM="$SELECTED_BACKUP/$(basename "$ORIG_PATH")"

    if [ ! -e "$BACKUP_ITEM" ]; then
        echo "⚠️  警告：备份中缺少项目，跳过 -> $BACKUP_ITEM"
        continue
    fi

    mkdir -p "$(dirname "$ORIG_PATH")"
    echo "正在还原 '$BACKUP_ITEM' → '$ORIG_PATH' ..."   # ← 这行完全没变！
    cp -a "$BACKUP_ITEM" "$ORIG_PATH"
done

echo "✅ 还原完成！"