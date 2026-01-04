# Miniform

**Miniform** is an educational Infrastructure-as-Code (IaC) engine built to demonstrate how tools like Terraform work under the hood.

## 🚀 Features
- **Custom DSL:** Simple, config-based syntax for defining resources.
- **State Management:** JSON-based state file for reconciliation.
- **Dependency Graph:** DAG-based execution ordering.
- **Local Provider:** 

## 📦 Installation

```bash
npm install
```

## 🛠 Usage

1.  Initialize a new workspace:
    ```bash
    npm run miniform init
    ```

2.  Create a `main.mini` file:
    ```
    resource "file" "example" {
      path = "./hello.txt"
      content = "Hello Miniform!"
    }
    ```

3.  Apply changes:
    ```bash
    npm run miniform apply
    ```

## 📝 License
ISC
