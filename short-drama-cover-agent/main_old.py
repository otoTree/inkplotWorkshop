#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
短剧封面生成 Agent
自动从飞书多维表格读取短剧信息，生成封面设计并回填结果
"""

import os
import sys
import time
import json
import requests
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 配置信息
FEISHU_APP_ID = os.getenv("FEISHU_APP_ID")
FEISHU_APP_SECRET = os.getenv("FEISHU_APP_SECRET")
FEISHU_API_BASE = os.getenv("FEISHU_API_BASE", "https://open.feishu.cn")
FEISHU_APP_TOKEN = os.getenv("FEISHU_APP_TOKEN")
FEISHU_TABLE_ID = os.getenv("FEISHU_TABLE_ID")
AI_API_KEY = os.getenv("AI_API_KEY")
AI_API_BASE = os.getenv("AI_API_BASE", "https://api.deepseek.com/v1")
AI_MODEL = os.getenv("AI_MODEL", "deepseek-chat")
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")


class FeishuClient:
    """飞书 API 客户端"""

    def __init__(self, app_id: str, app_secret: str, api_base: str = "https://open.feishu.cn"):
        self.app_id = app_id
        self.app_secret = app_secret
        self.api_base = api_base
        self.access_token = None
        self.token_expire_time = 0

    def get_access_token(self) -> str:
        """获取飞书 access_token"""
        # 如果 token 未过期，直接返回
        if self.access_token and time.time() < self.token_expire_time:
            return self.access_token

        url = f"{self.api_base}/open-api/auth/v3/tenant_access_token/internal"
        payload = {
            "app_id": self.app_id,
            "app_secret": self.app_secret
        }

        try:
            response = requests.post(url, json=payload)

            # 检查响应状态
            if response.status_code != 200:
                raise Exception(f"飞书 API 请求失败，状态码: {response.status_code}, 响应: {response.text}")

            data = response.json()
        except requests.exceptions.JSONDecodeError as e:
            raise Exception(f"飞书 API 返回非 JSON 格式数据: {response.text[:500]}")
        except Exception as e:
            raise Exception(f"获取 access_token 时发生错误: {str(e)}")

        if data.get("code") != 0:
            raise Exception(f"获取 access_token 失败: {data}")

        self.access_token = data["tenant_access_token"]
        # token 有效期 2 小时，提前 5 分钟刷新
        self.token_expire_time = time.time() + data["expire"] - 300
        return self.access_token

    def get_records(self, app_token: str, table_id: str, filter_field: str = "触发生成",
                    filter_value: str = "待生成") -> List[Dict]:
        """获取表格记录"""
        token = self.get_access_token()
        url = f"{self.api_base}/open-api/bitable/v1/apps/{app_token}/tables/{table_id}/records"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # 分页获取所有记录
        all_records = []
        page_token = None

        while True:
            params = {"page_size": 100}
            if page_token:
                params["page_token"] = page_token

            response = requests.get(url, headers=headers, params=params)
            data = response.json()

            if data.get("code") != 0:
                raise Exception(f"获取记录失败: {data}")

            records = data["data"]["items"]
            all_records.extend(records)

            if not data["data"].get("has_more"):
                break
            page_token = data["data"]["page_token"]

        # 筛选符合条件的记录
        filtered_records = []
        for record in all_records:
            fields = record.get("fields", {})
            if fields.get(filter_field) == filter_value:
                filtered_records.append(record)

        return filtered_records

    def update_record(self, app_token: str, table_id: str, record_id: str,
                     fields: Dict[str, Any]) -> bool:
        """更新表格记录"""
        token = self.get_access_token()
        url = f"{self.api_base}/open-api/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        payload = {"fields": fields}
        response = requests.put(url, headers=headers, json=payload)
        data = response.json()

        if data.get("code") != 0:
            print(f"更新记录失败: {data}")
            return False

        return True


class AIGenerator:
    """AI 内容生成器（Deepseek）"""

    def __init__(self, api_key: str, api_base: str, model: str):
        self.api_key = api_key
        self.api_base = api_base
        self.model = model

        from openai import OpenAI
        self.client = OpenAI(api_key=api_key, base_url=api_base)

    def generate_cover_content(self, drama_name: str, story: str,
                              character_name: str) -> Dict[str, str]:
        """生成封面内容（题材、Title、Slogan、Prompt）"""

        # 读取设计规则
        design_rules = """
# 短剧封面设计规则

## 题材识别
根据故事介绍判断题材：
- romance_ceo 霸总爱情：总裁、豪门、商战、婚约
- romance_fantasy 奇幻爱情：穿越、古代、修仙、王爷
- vampire 吸血鬼：永生、血族、夜族、黑暗力量
- werewolf 狼人：狼族、变身、月圆、野性
- campus 青春校园：高中、大学、初恋、社团
- crime 黑帮犯罪：黑帮、复仇、地下、枪战
- thriller 悬疑惊悚：失忆、追杀、秘密、推理
- apocalypse 末日灾难：末日、病毒、废土、生存
- scifi 科幻：外星、AI、未来、太空
- historical 历史古装：朝代、将军、皇帝、宫廷

## 标题结构（5种类型）
1. 情节关系型：身份A + 情节关系 + 身份B（如《总裁的秘密新娘》）
2. 情绪冲突型：情绪词 + 情绪词（如《痴迷与背叛》）
3. 身份叙事型：身份 + 属性（如《危险的他》）
4. 命运悬念型：疑问/宿命 + 转折（如《本该陌生的你》）
5. 动作宣言型：动词 + 宾语（如《逆袭归来》）

## Slogan 规则
- 字数：8-20字
- 语气：补充情绪，不重复标题
- 结构：[限制条件] + [情感动作] + [对象]
- 示例："他明知危险，却还是靠近了她"

## 题材→设计映射
| 题材 | 版式 | 字体 | 材质 | 颜色 | 光影 | 场景 |
|---|---|---|---|---|---|---|
| 霸总爱情 | couple_center | Luxury Serif | Gold Foil | Gold+Black | Golden Backlight | luxury_mansion |
| 吸血鬼 | face_off | Serif(Trajan) | Stone/Metal | Red+Black+White | Cold Rim Light | dark_castle |
| 末日灾难 | hero_portrait | Bold Sans | Metal | Crimson+Black | Environmental Light | burning_city |
| 黑帮犯罪 | face_off | Condensed Sans | Scratch | Black+Red | Dramatic Lighting | neon_street |
| 奇幻狼人 | hero_portrait | Decorative Serif | Ice/Stone | Purple+Blue | Moonlight | forest_night |
| 青春校园 | couple_center | Handwritten | Neon Glow | Yellow+White | Soft Diffused | campus |
| 历史古装 | hero_portrait | 宋体/仿宋 | Stone Carving | Gold+Red | Moonlight | ancient_palace |
| 科幻 | hero_portrait | Geometric Sans | Metal | Blue+Silver | Cold Rim Light | futuristic |

## Prompt 结构模板
[画幅比例] [版式布局] [主角描述] [角色站位+姿态] [视线结构] [光影模式] [场景背景] [标题文字设计] [整体氛围词]

通用质量词：cinematic poster, ultra-detailed, 8K, professional photography, volumetric lighting, depth of field

## 关键规则
1. 脸部面积 ≥ 画面 40%
2. 双字体系统：Script手写体 + Serif/Sans衬线体叠加
3. 字号层级：核心名词最大，形容词次之，介词最小
4. 背景虚化，聚焦主角面部情绪
"""

        system_prompt = f"""你是专业的短剧封面设计专家。请严格遵循以下设计规则生成封面方案。

{design_rules}

请以 JSON 格式返回，包含以下字段：
- genre: 识别的题材类型（使用英文标签，如 romance_ceo）
- title: 封面标题（中文，符合标题结构分类）
- slogan: 副标题（中文，8-20字，补充情绪）
- image_prompt: 16:9 总封面的图片生成 Prompt（英文，详细描述）
- episode_prompt: 3:4 分集封面的图片生成 Prompt（英文，详细描述）

注意：
1. 根据题材选择对应的版式、字体、材质、颜色、光影、场景
2. Prompt 必须包含：版式布局、角色描述、姿态、光影、场景、字体设计、氛围词
3. 确保脸部面积占比 ≥ 40%
4. 标题文字设计要体现双字体系统和材质效果"""

        user_prompt = f"""短剧信息：
剧名：{drama_name}
故事介绍：{story}
主角名称：{character_name}

请生成封面设计方案。"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                response_format={"type": "json_object"}
            )

            content = response.choices[0].message.content
            result = json.loads(content)
            return result

        except Exception as e:
            print(f"AI 生成失败: {e}")
            return None


class ImageGenerator:
    """图片生成器（Replicate Flux）"""

    def __init__(self, api_token: str):
        self.api_token = api_token
        import replicate
        self.client = replicate.Client(api_token=api_token)

    def generate_image(self, prompt: str, aspect_ratio: str = "16:9") -> Optional[str]:
        """使用 Flux 模型生成图片"""
        try:
            output = self.client.run(
                "black-forest-labs/flux-schnell",
                input={
                    "prompt": prompt,
                    "aspect_ratio": aspect_ratio,
                    "output_format": "png",
                    "output_quality": 100
                }
            )

            # output 是一个生成器或列表，获取第一个结果
            if isinstance(output, list):
                return output[0] if output else None
            return str(output)

        except Exception as e:
            print(f"图片生成失败: {e}")
            return None


def process_record(feishu: FeishuClient, ai_gen: AIGenerator, img_gen: ImageGenerator,
                  app_token: str, table_id: str, record: Dict) -> bool:
    """处理单条记录"""
    record_id = record["record_id"]
    fields = record.get("fields", {})

    # 提取字段
    drama_name = fields.get("剧名", "")
    story = fields.get("故事介绍", "")
    character_name = fields.get("主角名称", "")

    print(f"\n处理记录: {drama_name}")

    try:
        # 1. 更新状态为"生成中"
        feishu.update_record(app_token, table_id, record_id, {
            "触发生成": "生成中",
            "处理状态": "生成中"
        })

        # 2. 生成封面内容
        print("  - 生成封面内容...")
        content = ai_gen.generate_cover_content(drama_name, story, character_name)

        if not content:
            raise Exception("AI 生成内容失败")

        # 3. 回填文本内容
        feishu.update_record(app_token, table_id, record_id, {
            "识别题材": content.get("genre", ""),
            "封面标题 Title": content.get("title", ""),
            "副标题 Slogan": content.get("slogan", ""),
            "图片 Prompt": content.get("image_prompt", ""),
            "分集封面 Prompt": content.get("episode_prompt", "")
        })

        # 4. 生成图片
        print("  - 生成封面图片...")
        image_url = img_gen.generate_image(content.get("image_prompt", ""), "16:9")

        if not image_url:
            raise Exception("图片生成失败")

        # 5. 回填图片 URL 并标记完成
        feishu.update_record(app_token, table_id, record_id, {
            "生成图片 URL": image_url,
            "触发生成": "已完成",
            "处理状态": "已完成"
        })

        print(f"  ✓ 完成: {drama_name}")
        return True

    except Exception as e:
        print(f"  ✗ 失败: {e}")
        # 标记为失败
        feishu.update_record(app_token, table_id, record_id, {
            "触发生成": "失败",
            "处理状态": "失败"
        })
        return False


def main():
    """主函数"""
    print("=" * 60)
    print("短剧封面生成 Agent")
    print("=" * 60)

    # 检查环境变量
    required_vars = {
        "FEISHU_APP_ID": FEISHU_APP_ID,
        "FEISHU_APP_SECRET": FEISHU_APP_SECRET,
        "FEISHU_APP_TOKEN": FEISHU_APP_TOKEN,
        "FEISHU_TABLE_ID": FEISHU_TABLE_ID,
        "AI_API_KEY": AI_API_KEY,
        "REPLICATE_API_TOKEN": REPLICATE_API_TOKEN
    }

    missing_vars = [k for k, v in required_vars.items() if not v]
    if missing_vars:
        print(f"\n错误: 缺少环境变量: {', '.join(missing_vars)}")
        print("请在 .env 文件中配置这些变量")
        sys.exit(1)

    # 初始化客户端
    feishu = FeishuClient(FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_API_BASE)
    ai_gen = AIGenerator(AI_API_KEY, AI_API_BASE, AI_MODEL)
    img_gen = ImageGenerator(REPLICATE_API_TOKEN)

    # 获取待处理记录
    print("\n正在获取待处理记录...")
    records = feishu.get_records(FEISHU_APP_TOKEN, FEISHU_TABLE_ID)

    if not records:
        print("没有待处理的记录")
        return

    print(f"找到 {len(records)} 条待处理记录\n")

    # 逐条处理
    success_count = 0
    fail_count = 0

    for i, record in enumerate(records, 1):
        print(f"[{i}/{len(records)}]", end=" ")
        if process_record(feishu, ai_gen, img_gen, FEISHU_APP_TOKEN, FEISHU_TABLE_ID, record):
            success_count += 1
        else:
            fail_count += 1

        # 避免请求过快
        time.sleep(1)

    # 统计结果
    print("\n" + "=" * 60)
    print(f"处理完成: 成功 {success_count} 条, 失败 {fail_count} 条")
    print("=" * 60)


if __name__ == "__main__":
    main()
