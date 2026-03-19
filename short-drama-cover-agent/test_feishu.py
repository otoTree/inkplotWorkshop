#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
飞书连接测试脚本
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

print("=" * 60)
print("飞书连接测试")
print("=" * 60)
print(f"APP_ID: {FEISHU_APP_ID}")
print(f"APP_TOKEN: {FEISHU_APP_TOKEN}")
print(f"TABLE_ID: {FEISHU_TABLE_ID}")
print()

# 创建客户端
client = lark.Client.builder() \
    .app_id(FEISHU_APP_ID) \
    .app_secret(FEISHU_APP_SECRET) \
    .build()

# 测试获取记录
print("正在获取表格记录...")
request = ListAppTableRecordRequest.builder() \
    .app_token(FEISHU_APP_TOKEN) \
    .table_id(FEISHU_TABLE_ID) \
    .page_size(10) \
    .build()

response = client.bitable.v1.app_table_record.list(request)

if not response.success():
    print(f"❌ 请求失败:")
    print(f"   错误码: {response.code}")
    print(f"   错误信息: {response.msg}")
    print(f"   请求ID: {response.request_id}")
else:
    print(f"✓ 请求成功!")
    print(f"   获取到 {len(response.data.items)} 条记录")

    if response.data.items:
        print("\n前几条记录:")
        for i, record in enumerate(response.data.items[:3], 1):
            print(f"\n记录 {i}:")
            print(f"   Record ID: {record.record_id}")
            print(f"   字段: {list(record.fields.keys())}")
