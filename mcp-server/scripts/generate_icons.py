import os

from PIL import Image, ImageDraw

# Get absolute path relative to this script to avoid CWD issues
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR)) # Navigate up to KavanMCP folder
target_dir = os.path.join(ROOT_DIR, "desktop", "src-tauri", "icons")

# Ensure the target directory exists
os.makedirs(target_dir, exist_ok=True)

def create_tray_icon(color_hex, filename):
    # Create a transparent 256x256 image
    img = Image.new('RGBA', (256, 256), color=(0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw a smooth, filled circle with a slight margin
    draw.ellipse((16, 16, 240, 240), fill=color_hex)
    
    # Save as .ico format
    save_path = os.path.join(target_dir, filename)
    img.save(save_path, format='ICO', sizes=[(256, 256)])
    print(f"Generated: {save_path}")

# Tailwind-inspired colors for consistency
create_tray_icon('#22c55e', 'tray-green.ico')
create_tray_icon('#eab308', 'tray-yellow.ico')
create_tray_icon('#ef4444', 'tray-red.ico')
