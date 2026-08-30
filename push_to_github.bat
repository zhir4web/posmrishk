@echo off
chcp 65001 >nul
title Sargalu Chicken POS - Push to GitHub
echo ================================================================
echo   ناردنی سیستەمی مریشک فرۆشی سەرگەڵو بۆ سەر گیت-هەب (GitHub)
echo ================================================================
echo.
echo تکایە چاوەڕێبە پەنجەرەی گیت-هەب دەکرێتەوە تا ڕێگەپێدان بدەیت...
echo.

git remote remove origin >nul 2>&1
git remote add origin https://github.com/zhir4web/-.git
git branch -M main
git add .
git commit -m "Update Sargalu Chicken POS app" >nul 2>&1
git push -u origin main

echo.
if %errorlevel% equ 0 (
    echo ================================================================
    echo   [سەرکەوتوو بوو]: هەموو کۆدەکان بە سەرکەوتوویی نێردران بۆ سەر گیت-هەب!
    echo ================================================================
) else (
    echo [تێبینی]: تکایە دڵنیابە لە ناو پەنجەرەی گیت-هەب Sign In دەکەیت.
)

echo.
pause
