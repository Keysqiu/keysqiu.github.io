#!/bin/bash

# ========== 配置区（只需改这里！）==========
# 要备份的源文件夹列表（相对于本脚本目录，或写绝对路径）
SOURCE_DIRS=(
    "webapihost"
    "webclient"
    "scheduleserver1055"
    "scheduleserver1050"
)

# 备份根目录（必须是绝对路径！时间戳子目录将自动创建在此目录下）只需要给父目录就行，具体目录会按照当前日期时间自动生成
BACKUP_ROOT="/opt/smom/server/备份文件夹"
# =========================================

# 自动生成带时间戳的备份目录名：格式为 YYYY-MM-DD_HHMMSS
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

# 获取脚本所在目录（用于解析相对路径）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 创建备份目录
mkdir -p "$BACKUP_DIR"
if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ 无法创建备份目录: $BACKUP_DIR"
    exit 1
fi

echo "📁 新建备份目录: $BACKUP_DIR"
echo "⏳ 开始备份..."

# 遍历每个源目录进行备份
for src in "${SOURCE_DIRS[@]}"; do
    # 转为绝对路径
    if [[ "$src" != /* ]]; then
        SRC_PATH="$SCRIPT_DIR/$src"
    else
        SRC_PATH="$src"
    fi

    # 检查源是否存在
    if [ ! -e "$SRC_PATH" ]; then
        echo "⚠️  警告：源路径不存在，跳过 -> $SRC_PATH"
        continue
    fi

    # 目标路径 = BACKUP_DIR/源文件夹名
    DST_PATH="$BACKUP_DIR/$(basename "$SRC_PATH")"
    echo "正在备份 '$SRC_PATH' → '$DST_PATH' ..."

    # 执行备份（保留所有属性）
    cp -a "$SRC_PATH" "$DST_PATH"
done

echo "✅ 备份成功完成！"
echo "📦 备份位置: $BACKUP_DIR"