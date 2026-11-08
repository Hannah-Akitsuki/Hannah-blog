@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 寒鹤博客 · 一键同步

echo ============================================
echo   寒鹤博客 · 一键同步
echo ============================================
echo.

if not exist ".git" (
  echo [错误] 当前目录不是 git 仓库：%CD%
  goto :end
)

rem 0) 隐私检查：确认私密日记源文件已被忽略
findstr /c:"data/diary-all.json" ".gitignore" >nul 2>nul
if errorlevel 1 (
  echo [错误] .gitignore 里没有 data/diary-all.json。
  echo        为避免私密日记被提交，本次已停止。
  echo        请先在 .gitignore 加入一行：data/diary-all.json
  goto :end
)

rem 1) 由文章 front matter 生成 manifest / 公开日记 / 相册索引（没有 python 就跳过）
where python >nul 2>nul
if errorlevel 1 (
  echo [跳过] 没有找到 python，跳过 manifest、日记过滤与相册索引生成。
  echo        文章仍会同步，只是线上列表要等 GitHub Actions 自动重建。
) else (
  if exist "tools\build_manifest.py" (
    echo [1/5] 由文章 front matter 生成 manifest...
    python "tools\build_manifest.py"
    if errorlevel 1 echo [警告] manifest 生成失败，已跳过。
  ) else (
    echo [跳过] 没有 tools\build_manifest.py
  )
  if exist "tools\filter_diary.py" (
    echo [2/5] 生成公开日记...
    python "tools\filter_diary.py"
    if errorlevel 1 echo [警告] 日记过滤失败，已跳过。
  ) else (
    echo [跳过] 没有 tools\filter_diary.py
  )
  if exist "tools\build_photos.py" (
    echo [3/5] 更新相册索引...
    python "tools\build_photos.py"
    if errorlevel 1 echo [警告] 相册索引生成失败，已跳过。
  ) else (
    echo [跳过] 没有 tools\build_photos.py
  )
)

rem 2) 暂存并判断是否有改动
echo [4/5] 检查改动...
git add -A
git diff --cached --quiet
if errorlevel 1 goto :commit
echo.
echo [完成] 没有需要同步的改动。
goto :end

:commit
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"`) do set "TS=%%i"
if "%TS%"=="" set "TS=%date% %time%"
echo.
echo [5/5] 提交并推送：更新博客 %TS%
git commit -m "更新博客 %TS%"
if errorlevel 1 (
  echo [错误] 提交失败，请查看上面的报错。
  goto :end
)
git push
if errorlevel 1 (
  echo.
  echo [失败] 推送没有成功。请检查网络或代理是否可用，然后重新双击本文件。
  echo        本脚本不会 force push，也不会修改 git 配置。
  goto :end
)
echo.
echo [成功] 已推送，约 1-3 分钟后生效：https://hannah-akitsuki.github.io/Hannah-blog/

:end
echo.
pause
