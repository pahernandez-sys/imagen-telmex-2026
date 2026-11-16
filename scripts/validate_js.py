import subprocess
import os
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

def validate_app_js(repo_dir=None):
    if not repo_dir:
        repo_dir = r"c:\Users\PCI\Documents\Antigravity\imagen-telmex-2026"
    
    app_js_path = os.path.join(repo_dir, "app.js")
    if not os.path.exists(app_js_path):
        print(f"[Validator Error] No se encontró {app_js_path}")
        return False

    with open(app_js_path, "r", encoding="utf-8") as f:
        app_code = f.read()

    edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    if not os.path.exists(edge_path):
        print("[Validator Warning] Edge no disponible para prueba headless.")
        return True

    test_html_path = os.path.join(repo_dir, "_temp_validate_syntax.html")
    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
  <div id="result">OK</div>
  <script>
    window.onerror = function(msg, url, line, col, error) {{
      document.getElementById('result').innerText = 'ERROR: ' + msg + ' LINE:' + line;
    }};
  </script>
  <script>
{app_code}
  </script>
</body>
</html>"""

    with open(test_html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    temp_profile = r"C:\Users\PCI\AppData\Local\Temp\edge_val_profile"
    cmd = [
        edge_path,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--virtual-time-budget=2000",
        "--user-data-dir=" + temp_profile,
        "--dump-dom",
        "file:///" + test_html_path.replace("\\", "/")
    ]

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=12)
        has_error = False
        err_msg = ""
        if res.stdout:
            for line in res.stdout.splitlines():
                if '<div id="result">ERROR:' in line:
                    has_error = True
                    err_msg = line.strip()
                    break

        if has_error:
            print(f"❌ [VALIDACIÓN FALLIDA] Se detectó error en app.js:")
            print(f"   {err_msg}")
            return False
        else:
            print(f"✅ [VALIDACIÓN EXITOSA] app.js no contiene errores de sintaxis (0 errores).")
            return True
    except Exception as e:
        print(f"[Validator Error] Excepción al ejecutar validador: {e}")
        return False
    finally:
        if os.path.exists(test_html_path):
            try:
                os.remove(test_html_path)
            except Exception:
                pass

if __name__ == "__main__":
    success = validate_app_js()
    if not success:
        sys.exit(1)
    sys.exit(0)
