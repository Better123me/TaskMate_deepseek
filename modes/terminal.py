import asyncio
from agent.task_agent import assistant


async def main():
    print("=" * 50)
    print("   TaskMate - AI 任务管理助手")
    print("=" * 50)
    print()
    print("我可以帮你管理任务！")
    print("请用自然语言告诉我你想做什么")
    print("（输入 'quit' 或 '退出' 结束）")
    print()

    while True:
        user_input = input("你: ").strip()

        if not user_input:
            continue

        if user_input.lower() in ["quit", "exit", "退出", "再见"]:
            print("\n助手: 再见！有需要随时找我。\n")
            break

        try:
            result = await assistant.process(user_input)
            
            if isinstance(result, dict):
                output = result.get("output", "")
                steps = result.get("steps", [])
                
                if steps:
                    print("\n--- AI 思考过程 ---")
                    for step in steps:
                        print(step)
                        print()
                    print("--------------------\n")
                
                print(f"\n助手: {output}\n")
            else:
                print(f"\n助手: {result}\n")
                
        except Exception as e:
            print(f"\n错误: {str(e)}\n")


if __name__ == "__main__":
    asyncio.run(main())
