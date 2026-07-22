const validateNumberPlate = (text) => {

    const indianPlateRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;

    return indianPlateRegex.test(text);

};


module.exports = validateNumberPlate;