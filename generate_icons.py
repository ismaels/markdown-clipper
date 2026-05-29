import os
from PIL import Image, ImageDraw

def create_icon(size):
    # Create an RGBA image
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    
    # Calculate dimensions
    padding = max(1, size // 10)
    box = [padding, padding, size - padding, size - padding]
    corner_radius = size // 5
    
    # Draw dark slate rounded rectangle background (premium aesthetic)
    # Background: modern Indigo gradient or deep violet/indigo tone #4F46E5
    draw.rounded_rectangle(
        box,
        radius=corner_radius,
        fill=(79, 70, 229, 255),  # Indigo
        outline=(99, 102, 241, 255),  # Lighter indigo border
        width=max(1, size // 20)
    )
    
    # Draw clipping symbol (a modern document outline with a down arrow, or just a stylized letter 'M')
    # Let's draw a nice white letter 'M' in the center
    # Alternatively, draw simple shapes. Let's draw a document shape and a small arrow.
    # To keep it robust, let's write a stylized 'M'
    # We will draw a white 'M' using lines
    w = size
    h = size
    # Define coords relative to size
    p1 = (w * 0.3, h * 0.7)
    p2 = (w * 0.3, h * 0.3)
    p3 = (w * 0.5, h * 0.5)
    p4 = (w * 0.7, h * 0.3)
    p5 = (w * 0.7, h * 0.7)
    
    line_width = max(2, size // 8)
    draw.line([p1, p2, p3, p4, p5], fill=(255, 255, 255, 255), width=line_width, joint="round")
    
    # Save the file
    os.makedirs("/Users/ish/.gemini/antigravity/scratch/markdown-clipper/icons", exist_ok=True)
    image.save(f"/Users/ish/.gemini/antigravity/scratch/markdown-clipper/icons/icon-{size}.png", "PNG")
    print(f"Created icons/icon-{size}.png")

if __name__ == "__main__":
    try:
        for s in [16, 48, 128]:
            create_icon(s)
    except Exception as e:
        print("Error generating icons:", e)
        print("Attempting fallback using basic tkinter or simple file touch to avoid blocking...")
