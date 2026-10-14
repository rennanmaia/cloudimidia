@echo off
REM Gera o APK de producao do CloudiMidia Player.
REM Requer as ferramentas em C:\android-build (JDK 17 + Android SDK) e o build do frontend em /public.
set JAVA_HOME=C:\android-build\jdk17
set ANDROID_HOME=C:\android-build\sdk
set ANDROID_SDK_ROOT=C:\android-build\sdk
set GRADLE_USER_HOME=C:\android-build\gradle-home
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%
cd /d "%~dp0android"
call "%~dp0android\gradlew.bat" assembleRelease --no-daemon --console=plain %*
if errorlevel 1 exit /b 1
echo.
echo APK gerado em: %~dp0android\app\build\outputs\apk\release\app-release.apk