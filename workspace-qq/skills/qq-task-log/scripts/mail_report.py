#!/usr/bin/env python3
# 日报邮件发送：用 SMTP 把日报文本发到指定邮箱。零依赖（标准库 smtplib）。
#
# 用法：
#   python3 mail_report.py --to "you@example.com" --subject "任务日报 2026-10-22" --body-file report.md
#   cat report.md | python3 mail_report.py --to "you@example.com"   # 正文走 stdin 也行
#
# 凭据走环境变量（不写进任何文件）：
#   SMTP_HOST  默认 smtp.qq.com
#   SMTP_PORT  默认 465（SSL）
#   SMTP_USER  发件邮箱
#   SMTP_PASS  SMTP 授权码（QQ 邮箱：设置→账户→开启 SMTP 服务→生成授权码）

import argparse
import os
import smtplib
import sys
from email.header import Header
from email.mime.text import MIMEText


def main() -> None:
    p = argparse.ArgumentParser(description="SMTP 邮件发送（零依赖）")
    p.add_argument("--to", required=True, help="收件邮箱")
    p.add_argument("--subject", default="任务日报", help="邮件主题")
    p.add_argument("--body-file", help="正文文件路径；不传则读 stdin")
    args = p.parse_args()

    host = os.environ.get("SMTP_HOST", "smtp.qq.com")
    port = int(os.environ.get("SMTP_PORT", "465"))
    user = os.environ.get("SMTP_USER", "")
    pwd = os.environ.get("SMTP_PASS", "")
    if not user or not pwd:
        print("缺少环境变量 SMTP_USER / SMTP_PASS", file=sys.stderr)
        sys.exit(1)

    if args.body_file:
        with open(args.body_file, encoding="utf-8") as f:
            body = f.read()
    else:
        body = sys.stdin.read()
    if not body.strip():
        print("正文为空", file=sys.stderr)
        sys.exit(1)

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = Header(args.subject, "utf-8")
    msg["From"] = user
    msg["To"] = args.to

    try:
        with smtplib.SMTP_SSL(host, port, timeout=30) as s:
            s.login(user, pwd)
            s.sendmail(user, [args.to], msg.as_string())
    except smtplib.SMTPAuthenticationError:
        print("SMTP 认证失败：检查 SMTP_USER / SMTP_PASS（邮箱授权码，不是登录密码）", file=sys.stderr)
        sys.exit(1)
    except OSError as e:
        print(f"SMTP 连接失败：{e}", file=sys.stderr)
        sys.exit(1)
    print(f"已发送到 {args.to}")


if __name__ == "__main__":
    main()
