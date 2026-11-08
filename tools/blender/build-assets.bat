@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0..\.."

set BLENDER=
if exist "D:\Blender 5.2\blender.exe" set BLENDER=D:\Blender 5.2\blender.exe
if not defined BLENDER if exist "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" set BLENDER=C:\Program Files\Blender Foundation\Blender 5.2\blender.exe
if not defined BLENDER for /f "delims=" %%i in ('where blender 2^>nul') do set BLENDER=%%i

if not defined BLENDER (
  echo [失败] 没找到 Blender。请安装 Blender 5.x，或把 blender.exe 加到 PATH。
  pause
  exit /b 1
)

echo [1/3] 用 Blender 重建 GLB 与静态渲染图 ...
"%BLENDER%" -b -P tools\blender\build_assets.py -- --scene all --out assets/3d --render-dir .tmp-render
if errorlevel 1 goto fail

echo [2/3] 渲染图转 WebP ...
python tools\blender\to_webp.py .tmp-render assets\3d
if errorlevel 1 goto fail

echo [3/3] 完成。产物在 assets\3d\
dir /b assets\3d
pause
exit /b 0

:fail
echo [失败] 构建中断，请查看上面的报错。
pause
exit /b 1
