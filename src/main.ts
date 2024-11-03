// todo
function onButtonClick() {
  alert("You clicked the button");
}

const button = document.createElement("button");
button.textContent = "Click";

button.addEventListener("click", onButtonClick);

document.body.appendChild(button);
