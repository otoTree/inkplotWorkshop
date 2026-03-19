#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
查看飞书表格字段名称
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

print("正在获取表格记录...")
request = ListAppTableRecordRequest.builder() \
    .app_token(FEISHU_APP_TOKEN) \
    .table_id(FEISHU_TABLE_ID) \
    .page_size(10) \
    .build()

response = client.bitable.v1.app_table_record.list(request)

if response.success():
    print(f"\n找到 {len(response.data.items)} 条记录\n")

    # 收集所有字段名
    all_fields = set()
    for record in response.data.items:
        all_fields.update(record.fields.keys())

    print("表格中的所有字段名称：")
    for field in sorted(all_fields):
        print(f"  - {field}")

    print("\n第一条记录的详细信息：")
    if response.data.items:
        record = response.data.items[0]
        print(f"Record ID: {record.record_id}")
        print("字段内容：")
        for key, value in record.fields.items():
            print(f"  {key}: {value}")
else:
    print(f"获取失败: {response.code} - {response.msg}")
