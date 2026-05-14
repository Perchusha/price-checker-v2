@echo off
echo Installing Camoufox and dependencies...
pip install "camoufox[geoip]"
echo.
echo Downloading Camoufox Firefox binary...
python -m camoufox fetch
echo.
echo Setup complete. You can now run Price Checker.
pause
