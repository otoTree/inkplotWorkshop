#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
短剧封面生成 Agent - 使用飞书官方 SDK
"""

import os
import sys
import time
import json
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv

# 飞书 SDK
import lark_oapi as lark
from lark_oapi.api.bitable.v1 import *

# 加载环境变量
load_dotenv()

# 配置信息
FEISHU_APP_ID = os.getenv("FEISHU_APP_ID")
FEISHU_APP_SECRET = os.getenv("FEISHU_APP_SECRET")
FEISHU_APP_TOKEN = os.getenv("FEISHU_APP_TOKEN")
FEISHU_TABLE_ID = os.getenv("FEISHU_TABLE_ID")
AI_API_KEY = os.getenv("AI_API_KEY")
AI_API_BASE = os.getenv("AI_API_BASE", "https://api.deepseek.com/v1")
AI_MODEL = os.getenv("AI_MODEL", "deepseek-chat")
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")


class FeishuClient:
    """飞书 API 客户端（使用官方 SDK）"""

    def __init__(self, app_id: str, app_secret: str):
        self.client = lark.Client.builder() \
            .app_id(app_id) \
            .app_secret(app_secret) \
            .build()

    def get_records(self, app_token: str, table_id: str,
                    filter_field: str = "触发生成",
                    filter_value: str = "待生成") -> List[Dict]:
        """获取表格记录"""
