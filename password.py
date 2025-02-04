import hashlib
new_password = "tZ03=I.ilB$UaW53M,1X"
hashed_password = hashlib.sha256(new_password.encode()).hexdigest()
print(hashed_password)