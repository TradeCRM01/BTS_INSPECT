import zipfile
import xml.etree.ElementTree as ET
import os
import sys

docx_path = "/tmp/cc-agent/66140643/project/form.docx"

# Also check the originally requested path
if not os.path.exists(docx_path):
    alt_path = "/tmp/form.docx"
    if os.path.exists(alt_path):
        docx_path = alt_path
    else:
        print(f"File not found at either of:")
        print(f"  {docx_path}")
        print(f"  {alt_path}")
        sys.exit(1)

print(f"Found: {docx_path} ({os.path.getsize(docx_path)} bytes)")

with zipfile.ZipFile(docx_path, "r") as z:
    if "word/document.xml" not in z.namelist():
        print("word/document.xml not found in archive.")
        print("Archive contents:", z.namelist())
        sys.exit(1)

    with z.open("word/document.xml") as f:
        xml_content = f.read()

root = ET.fromstring(xml_content)

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

texts = [
    t.text for t in root.iter(f"{{{W_NS}}}t") if t.text
]

if texts:
    print("\n--- Extracted Text (paragraph by paragraph) ---")
    for para in root.iter(f"{{{W_NS}}}p"):
        line = "".join(
            t.text for t in para.iter(f"{{{W_NS}}}t") if t.text
        )
        if line.strip():
            print(line)
else:
    print("No text elements (w:t) found in document.xml.")
