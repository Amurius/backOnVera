async function send() {
const sendData = await fetch("http://localhost:3000/api/auth/register", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    "email": "admin@vera.com",
    "firstName": "Super",
    "lastName": "Admin",
    "role":"admin",
    "password": "V3r4sup3r4dm1n!"

  })
}).then(response => {
    return response.json();
  }).then(data => {
    console.log(data)
  })
}


send();
