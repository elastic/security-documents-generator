export const userNameWhitespaceRemoved = (userName: string) => {
  return userName.replace(/\s+/g, '_');
};

export const userNameAsEmail = (userName: string) => {
  return `${userNameWhitespaceRemoved(userName)}@elastic.co`;
};
