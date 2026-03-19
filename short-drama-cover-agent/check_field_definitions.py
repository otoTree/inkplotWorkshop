#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
获取飞书表格的字段定义
"""

import os
from dotenv import load_dotenv
import lark_oapi as lark
from lark_oapi.api.bitable.v1 import *

load_dotenv()

FEISHU_APP_ID = os.getenv("FEISHU_APP_ID")
FEISHU_APP_SECRET = os.getenv("FEISHU_APP_SECRET")
FEISHU_APP_TOKEN = os.getenv("FEISHU_APP_TOKEN")
FEISHU_TABLE_ID = os.getenv("FEISHU_TABLE_ID")

client = lark.Client.builder() \
    .app_id(FEISHU_APP_ID) \
    .app_secret(FEISHU_APP_SECRET) \
    .build()

print("正在获取表格字段定义...")
request = ListAppTableFieldRequest.builder() \
    .app_token(FEISHU_APP_TOKEN) \
    .table_id(FEISHU_TABLE_ID) \
    .build()

response = client.bitable.v1.app_table_field.list(request)

if response.success():
    print(f"\n表格共有 {len(response.data.items)} 个字段：\n")

    for i, field in enumerate(response.data.items, 1):
        print(f"{i}. {field.field_name} (类型: {field.type})")
else:
    print(f"获取失败: {response.code} - {response.msg}")
