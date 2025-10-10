import axiosClient from './axiosClient';

export const userService = {
  async getAllUsers() {
    const response = await axiosClient.get('/api/users');
    return response.data;
  },
};
