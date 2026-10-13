import os
import sys
import socket
import datetime
import ipaddress
import uvicorn

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def ensure_ssl_certs(local_ip: str):
    cert_path = "cert.pem"
    key_path = "key.pem"

    if os.path.exists(cert_path) and os.path.exists(key_path):
        return cert_path, key_path

    print("Generating local SSL certificates for mobile camera support...")
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, u"ScavengerHuntLocal")
        ])

        san_list = [
            x509.DNSName(u"localhost"),
            x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
        ]
        try:
            san_list.append(x509.IPAddress(ipaddress.IPv4Address(local_ip)))
        except Exception:
            pass

        cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.datetime.utcnow()
        ).not_valid_after(
            datetime.datetime.utcnow() + datetime.timedelta(days=365)
        ).add_extension(
            x509.SubjectAlternativeName(san_list),
            critical=False
        ).sign(key, hashes.SHA256())

        with open(key_path, "wb") as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            ))
        with open(cert_path, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))

        print("SSL certificates ready.")
        return cert_path, key_path
    except Exception as e:
        print(f"Warning: Could not generate SSL certificates: {e}")
        return None, None

if __name__ == "__main__":
    local_ip = get_local_ip()
    port = 8000

    use_http_only = "--http" in sys.argv
    cert_path, key_path = (None, None) if use_http_only else ensure_ssl_certs(local_ip)

    print("\n" + "=" * 68)
    print("       SCAVENGER // YOLO AR OBJECT FINDER GAME")
    print("=" * 68)

    if cert_path and key_path:
        print(f" -> Desktop Browser:      https://localhost:{port}")
        print(f" -> Mobile Phone (HTTPS): https://{local_ip}:{port}")
        print("-" * 68)
        print(" [MOBILE CAMERA INSTRUCTIONS]")
        print(f" 1. Open on your phone: https://{local_ip}:{port}")
        print(" 2. Your browser will say 'Connection is not private'")
        print(" 3. Tap 'Advanced' (or 'More options') -> 'Proceed to site'")
        print(" 4. Allow camera permissions when prompted!")
        print("=" * 68 + "\n")

        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=port,
            ssl_certfile=cert_path,
            ssl_keyfile=key_path,
            reload=True
        )
    else:
        print(f" -> Desktop Browser:     http://localhost:{port}")
        print(f" -> Mobile Phone (HTTP): http://{local_ip}:{port}")
        print("-" * 68)
        print(" [ANDROID CHROME CAMERA ON HTTP]")
        print(f" 1. Open 'chrome://flags/#unsafely-treat-insecure-origin-as-secure'")
        print(f" 2. Add 'http://{local_ip}:{port}' and set to 'Enabled'")
        print(" 3. Tap 'Relaunch' at bottom of Chrome")
        print("=" * 68 + "\n")

        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=port,
            reload=True
        )
