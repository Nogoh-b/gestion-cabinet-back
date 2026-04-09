export class Func {
  static  stringToBool(str) {
    if (typeof str === "boolean") return str;
    if (typeof str !== "string") return false;
    
    return ["true", "1", "yes", "y", "on"].includes(str.toLowerCase().trim());
  }

  

}