import { ref } from "vue";
import { getToken } from "./api";

export const getAuth = async () => {
  // do we have token in LS?
  const tokenInLocal = localStorage.getItem("token");
  const tokenExpiryDate = localStorage.getItem("tokenExpiryDate");
  if (tokenInLocal) {
    console.log("yep we got token is LS");
    console.log(isTokenExpired(tokenExpiryDate));
    if (isTokenExpired(tokenExpiryDate)) {
      console.log("yep it is expired");
      setToken();
      return localStorage.getItem("token");
    } else {
      console.log("nope, not expired");
      return localStorage.getItem("token");
    }
    // is the token expired?
  } else {
    setToken();
    return localStorage.getItem("token");
  }
};

function setToken() {
  localStorage.clear;
  getToken().then((response) => {
    localStorage.setItem("token", response.access_token);
    const timeStamp = Date.now();
    localStorage.setItem("tokenExpiryDate", +timeStamp + 3600000);
  });
}

function isTokenExpired(expiryDate) {
  const currentTime = Date.now();
  return expiryDate < currentTime;
}
