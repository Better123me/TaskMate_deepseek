import sys
import subprocess
import os
from pathlib import Path


def get_venv_python():
    script_dir = Path(__file__).parent
    venv_python = script_dir / "venv" / "Scripts" / "python.exe"
    
    if venv_python.exists():
        return str(venv_python)
    return sys.executable


def main():
    venv_python = get_venv_python()
    
    if venv_python != sys.executable:
        print(f"检测到虚拟环境，正在使用虚拟环境运行...")
        print()
    
    print("=" * 50)
    print("   TaskMate - AI 任务管理助手")
    print("=" * 50)
    print()
    print("请选择运行模式：")
    print("  1 - 终端模式")
    print("  2 - Web 界面模式")
    print()

    while True:
        choice = input("请输入选项 (1/2): ").strip()

        if choice == "1":
            print("\n正在启动终端模式...")
            print("=" * 50)
            subprocess.run([venv_python, "-m", "modes.terminal"])
            break
        elif choice == "2":
            print("\n正在启动 Web 界面模式...")
            print("=" * 50)
            web_path = Path(__file__).parent / "modes" / "web_streamlit.py"
            subprocess.run([venv_python, "-m", "streamlit", "run", str(web_path)])
            break
        else:
            print("无效的选项，请输入 1 或 2")


if __name__ == "__main__":
    main()
